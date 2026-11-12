async function run() {
  const target = 'https://gif-robertson-testimonials-intelligence.trycloudflare.com/login';
  const initRes = await fetch('https://check-host.net/check-http?host=' + encodeURIComponent(target) + '&max_nodes=3', {
    headers: { 'Accept': 'application/json' }
  });
  const initData = await initRes.json();
  console.log('Testing /login. Request ID:', initData.request_id);
  await new Promise(r => setTimeout(r, 12000));
  const resultRes = await fetch('https://check-host.net/check-result/' + initData.request_id);
  const resultData = await resultRes.json();
  console.log(JSON.stringify(resultData, null, 2));
}

run();
