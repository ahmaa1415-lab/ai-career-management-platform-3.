async function main() {
  const postText = `📢 We're Hiring! | Ourshopee – Dubai

We are looking for talented professionals to join our growing team for the following positions:

🔹 Finance Manager – #CA qualified, 5+ years of experience. #E-commerce experience is mandatory.
🔹 Category Manager – 5+ years of experience in #Beauty, #Cosmetics, or #Health categories. UAE experience is mandatory.
🔹 Buyer – Experience in Fashion Accessories or Generic Products. UAE experience is mandatory.
🔹 Procurement Coordinator – 2+ years of experience. UAE experience is mandatory.
📍 Location: Dubai, UAE

🏢 Work Mode: On-site
📅 Working Days: Monday to Saturday

Interested candidates who meet the above requirements are invited to share their updated CV at mansi.deo@ourshopee.com

#Hiring #DubaiJobs #UAEJobs #OnsiteJobs #FinanceManager #CategoryManager #Buyer #ProcurementCoordinator #Ourshopee`;

  const res = await fetch('http://localhost:3000/api/linkedin/parse-post', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      post_text: postText,
      auto_index: true,
      auto_apply_role: 'Category Manager'
    })
  });

  const data = await res.json();
  console.log('HTTP Status:', res.status);
  console.log('Success:', data.success);
  console.log('Employer:', data.analysis?.employer);
  console.log('Extracted Roles:', data.analysis?.extracted_roles?.map((r: any) => `${r.title} (${r.experience_years}+ yrs, Match: ${r.match_score}%)`));
  console.log('Recruiter Email:', data.analysis?.recruiter_email);
  console.log('Application Result Status:', data.application_result?.status);

  // Now verify that the job listings in DB have publication dates and can be fetched via /api/jobs
  const jobsRes = await fetch('http://localhost:3000/api/jobs?top=true');
  const jobsData = await jobsRes.json();
  const ourshopeeJob = jobsData.opportunities?.find((o: any) => o.job.employer === 'Ourshopee');
  console.log('Found Ourshopee in top opportunities:', Boolean(ourshopeeJob));
  if (ourshopeeJob) {
    console.log('Ourshopee Job Title:', ourshopeeJob.job.title);
    console.log('Ourshopee Publication Date:', ourshopeeJob.job.publication_date);
    console.log('Ourshopee Match Score:', ourshopeeJob.match.overall_score);
  }

  // Now verify that /api/crm/status returns publication dates for all applications
  const crmRes = await fetch('http://localhost:3000/api/crm/status');
  const crmData = await crmRes.json();
  const sampleApp = crmData.applications?.[0];
  console.log('Total applications in CRM:', crmData.applications?.length);
  console.log('Sample App Job Date:', sampleApp?.job?.publication_date);
}

main().catch(console.error);
