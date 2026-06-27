import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifyAssertion } from '@/lib/steam-openid';
import { SteamIntegrationService } from '@/lib/steam';
import { logAudit } from '@/lib/auth';
import { clientIp, userAgent } from '@/lib/request';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams.entries());

  // 1. Strictly verify the OpenID assertion with Steam.
  const steamId = await verifyAssertion(query);
  if (!steamId) {
    return NextResponse.redirect(new URL('/?auth=failed', request.url));
  }

  // 2. Pull the profile from the Steam Web API.
  const steam = new SteamIntegrationService();
  const player = await steam.getPlayerSummary(steamId);
  if (!player) {
    return NextResponse.redirect(new URL('/?auth=profile_error', request.url));
  }

  const secureEmail = `${steamId}@steam.cs2gold.local`;

  // 3. Upsert the Supabase auth user (passwordless — Steam is the IdP).
  let dbUser = await prisma.user.findUnique({ where: { steamId } });
  if (!dbUser) {
    const { data: authUser, error } = await supabaseAdmin.auth.admin.createUser({
      email: secureEmail,
      email_confirm: true,
      user_metadata: { steam_id: steamId, steam_name: player.personaname, steam_avatar: player.avatarfull, role: 'USER' },
    });
    if (error || !authUser.user) {
      return NextResponse.redirect(new URL('/?auth=provision_error', request.url));
    }
    dbUser = await prisma.user.create({
      data: {
        id: authUser.user.id,
        email: secureEmail,
        username: player.personaname,
        steamId,
        steamName: player.personaname,
        steamAvatar: player.avatarfull,
      },
    });
    // Provision the wallet (DB trigger also covers this; upsert is safe).
    await prisma.wallet.upsert({ where: { userId: dbUser.id }, update: {}, create: { userId: dbUser.id } });
  } else {
    dbUser = await prisma.user.update({
      where: { id: dbUser.id },
      data: { steamName: player.personaname, steamAvatar: player.avatarfull },
    });
    // The Prisma `role` column is the single source of truth for authorization
    // (every /api/admin/* route checks it via requireRole). Supabase auth
    // user_metadata.role is only a cached copy used by edge middleware for the
    // UI redirect, so it must be re-synced on every login or a role promotion/
    // demotion in the DB would never be reflected there.
    await supabaseAdmin.auth.admin.updateUserById(dbUser.id, {
      user_metadata: { steam_id: steamId, steam_name: player.personaname, steam_avatar: player.avatarfull, role: dbUser.role },
    });
  }

  await logAudit({
    userId: dbUser.id,
    action: 'STEAM_OPENID_LOGIN',
    ipAddress: clientIp(request),
    userAgent: userAgent(request),
    details: { steamId },
  });

  // 4. Mint a session via an email magic link (passwordless) and forward the user.
  const { data: link } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: secureEmail,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? url.origin}/dashboard` },
  });

  if (link?.properties?.action_link) {
    return NextResponse.redirect(link.properties.action_link);
  }
  return NextResponse.redirect(new URL('/dashboard', request.url));
}
