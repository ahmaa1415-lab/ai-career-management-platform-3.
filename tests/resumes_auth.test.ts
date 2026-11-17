import assert from 'assert';
import { GET, PUT, POST } from '@/app/api/resumes/route';

// Helper to create a Request without authentication
function makeRequest(url: string, method: string = 'GET', body?: any): Request {
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'content-type': 'application/json' };
  }
  return new Request(url, init);
}

(async () => {
  // GET without auth should return 401
  const getRes = await GET(makeRequest('http://localhost/api/resumes')) as any;
  assert.strictEqual(getRes.status, 401, 'GET without auth should be 401');

  // PUT without auth should return 401
  const putRes = await PUT(makeRequest('http://localhost/api/resumes', 'PUT', { resume_id: 'dummy' })) as any;
  assert.strictEqual(putRes.status, 401, 'PUT without auth should be 401');

  // POST without auth should return 401
  const postRes = await POST(makeRequest('http://localhost/api/resumes', 'POST', { title: 'Test' })) as any;
  assert.strictEqual(postRes.status, 401, 'POST without auth should be 401');

  console.log('All resumes auth tests passed');
})();
