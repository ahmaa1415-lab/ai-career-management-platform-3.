import http from 'http';

async function testApi() {
  const postData = JSON.stringify({
    post_text: `We're Hiring! | Ourshopee – Dubai

Finance Manager – #CA qualified, 5+ years of experience. #E-commerce experience is mandatory.
Category Manager – 5+ years of experience in #Beauty, #Cosmetics, or #Health categories. UAE experience is mandatory.
Buyer – Experience in Fashion Accessories or Generic Products. UAE experience is mandatory.
Procurement Coordinator – 2+ years of experience. UAE experience is mandatory.
Location: Dubai, UAE
Work Mode: On-site
Working Days: Monday to Saturday

Interested candidates who meet the above requirements are invited to share their updated CV at mansi.deo@ourshopee.com`,
    auto_index: true,
    auto_apply_role: 'Category Manager'
  });

  const req = http.request('http://localhost:3000/api/linkedin/parse-post', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('HTTP Status:', res.statusCode);
      const parsed = JSON.parse(data);
      console.log('API Response Success:', parsed.success);
      console.log('Roles Disaggregated:', parsed.analysis?.extracted_roles?.length);
      console.log('Employer:', parsed.analysis?.employer);
      console.log('Recruiter:', parsed.analysis?.recruiter_email, '|', parsed.analysis?.recruiter_name);
      console.log('Auto Apply Application ID:', parsed.application_result?.application_id);
      console.log('Auto Apply CV Attached:', parsed.application_result?.cv_title);
      console.log('Auto Apply Recipient:', parsed.application_result?.recruiter_email);
    });
  });
  req.on('error', err => console.error('Error:', err));
  req.write(postData);
  req.end();
}

testApi();
