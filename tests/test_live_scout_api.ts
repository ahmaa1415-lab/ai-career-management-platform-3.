import http from 'http';

const req = http.request('http://localhost:3000/api/linkedin/scout-and-apply', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('POST /api/linkedin/scout-and-apply Status:', res.statusCode);
    const parsed = JSON.parse(data);
    console.log('Success:', parsed.success);
    console.log('Applications Dispatched:', parsed.applications_dispatched_count);
    console.log('Channels:', parsed.channel_summary);
    if (parsed.dispatched_applications) {
      parsed.dispatched_applications.forEach((a: any) => {
        console.log(`- ${a.role} at ${a.employer}: ${a.channel_label} (Match: ${a.match_score}%)`);
      });
    }
  });
});
req.write(JSON.stringify({ action: 'run_scout' }));
req.end();
