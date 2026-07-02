// api/wallet-nfts.js — Vercel serverless function (same pattern as booa-studio)
// GET /api/wallet-nfts?address=0x...
// → { count, bonsai: [{ id, name, image (on-chain data URI), attributes }] }
//
// Setup: Vercel → Project → Settings → Environment Variables → ALCHEMY_API_KEY
// (free key from alchemy.com — the same key also works as a custom RPC:
//  https://eth-mainnet.g.alchemy.com/v2/KEY for future-month previews)

const BONSAI_CONTRACT = '0xd1bd61c856c1aee57f0439bc018a2b712ce89580';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { address } = req.query;
  const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address))
    return res.status(400).json({ error: 'Invalid address' });
  if (!ALCHEMY_KEY)
    return res.status(500).json({ error: 'ALCHEMY_API_KEY not set in Vercel env vars' });

  try {
    const owned = [];
    let pageKey;
    for (let page = 0; page < 10; page++) {
      const url = new URL(`https://eth-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_KEY}/getNFTsForOwner`);
      url.searchParams.set('owner', address);
      url.searchParams.set('withMetadata', 'true');
      url.searchParams.set('pageSize', '100');
      url.searchParams.append('contractAddresses[]', BONSAI_CONTRACT);
      if (pageKey) url.searchParams.set('pageKey', pageKey);

      const r = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (!r.ok) return res.status(502).json({ error: 'Alchemy error ' + r.status });

      const data = await r.json();
      owned.push(...(data.ownedNfts || []));
      pageKey = data.pageKey;
      if (!pageKey) break;
    }

    const bonsai = owned.map((nft) => {
      const meta = nft.raw?.metadata || {};
      // keep the raw tokenURI image — the contract's own data:image/svg+xml URI
      let image = meta.image || '';
      if (!image) {
        const img = nft.image || {};
        image = img.cachedUrl || img.thumbnailUrl || '';
      }
      return {
        id: parseInt(nft.tokenId, 10) || 0,
        name: nft.name || meta.name || `Bonsai #${nft.tokenId}`,
        image,
        attributes: meta.attributes || [],
      };
    }).filter((b) => b.id && b.image);

    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json({ count: bonsai.length, bonsai });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
