import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';

const STEAM_APPID = 730;
const STEAM_CONTEXTID = 2;
const CACHE_TTL = 120; // seconds

interface InventoryItem {
  assetId: string; classId: string; instanceId: string;
  name: string; marketHash: string; weapon: string; type: string;
  exterior: string; rarity: string; isStatTrak: boolean;
  imageUrl: string; inspectLink: string | null; tradable: boolean;
}

export async function GET(request: Request) {
  const steamId = new URL(request.url).searchParams.get('steamId');
  if (!steamId || !/^\d{17}$/.test(steamId)) {
    return NextResponse.json({ error: 'Valid 64-bit Steam ID required' }, { status: 400 });
  }

  const cacheKey = `inv:${steamId}`;
  const cached = await cacheGet<InventoryItem[]>(cacheKey);
  if (cached) return NextResponse.json({ items: cached, cached: true });

  try {
    const url = `https://steamcommunity.com/inventory/${steamId}/${STEAM_APPID}/${STEAM_CONTEXTID}?l=english&count=2000`;
    const res = await fetch(url, { headers: { 'User-Agent': 'CS2GOLD/1.0' }, cache: 'no-store' });
    if (res.status === 403) {
      return NextResponse.json({ error: 'Steam inventory is private. Set it to public to list items.' }, { status: 403 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: 'Steam inventory could not be loaded. Try again shortly.' }, { status: 502 });
    }

    const data = await res.json();
    if (!data?.assets || !data?.descriptions) {
      return NextResponse.json({ items: [] });
    }

    const descMap = new Map<string, any>();
    for (const d of data.descriptions) descMap.set(`${d.classid}_${d.instanceid}`, d);

    const items: InventoryItem[] = data.assets.map((asset: any) => {
      const desc = descMap.get(`${asset.classid}_${asset.instanceid}`) || {};
      let weapon = '', type = 'Other', exterior = 'Not Painted', rarity = 'Common';
      for (const tag of desc.tags ?? []) {
        if (tag.category === 'Weapon') weapon = tag.localized_tag_name ?? tag.name;
        if (tag.category === 'Type') type = tag.localized_tag_name ?? tag.name;
        if (tag.category === 'Exterior') exterior = tag.localized_tag_name ?? tag.name;
        if (tag.category === 'Rarity') rarity = tag.localized_tag_name ?? tag.name;
      }
      const inspect = (desc.actions ?? []).find((a: any) => /inspect/i.test(a.name))?.link ?? null;
      return {
        assetId: asset.assetid,
        classId: asset.classid,
        instanceId: asset.instanceid,
        name: desc.name ?? '',
        marketHash: desc.market_hash_name ?? desc.name ?? '',
        weapon,
        type,
        exterior,
        rarity,
        isStatTrak: typeof desc.market_hash_name === 'string' && desc.market_hash_name.includes('StatTrak'),
        imageUrl: desc.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}` : '',
        inspectLink: inspect ? inspect.replace('%assetid%', asset.assetid).replace('%owner_steamid%', steamId) : null,
        tradable: desc.tradable === 1,
      };
    });

    await cacheSet(cacheKey, items, CACHE_TTL);
    return NextResponse.json({ items, cached: false });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
