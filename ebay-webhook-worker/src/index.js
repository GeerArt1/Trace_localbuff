export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET') {
      const challengeCode = url.searchParams.get('challenge_code');
      if (challengeCode) {
        const verificationToken = env.EBAY_VERIFICATION_TOKEN;
        const endpoint = (url.origin + url.pathname).replace(/\/$/, '');

        const message = challengeCode + verificationToken + endpoint;
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const challengeResponse = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        return new Response(JSON.stringify({ challengeResponse }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (request.method === 'POST') {
      return new Response('OK', { status: 200 });
    }

    return new Response('eBay Webhook Active', { status: 200 });
  },
};
