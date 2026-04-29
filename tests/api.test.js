const request = require('supertest');
const { app, initDb, db } = require('../server');

beforeAll(async () => {
    // Initialize in-memory database
    await initDb();
});

afterAll((done) => {
    // Close database connection
    db.close(done);
});

describe('Workspace API Endpoints', () => {
    
    it('should fetch an empty list of projects initially', async () => {
        const res = await request(app).get('/api/projects');
        expect(res.statusCode).toEqual(200);
        expect(Array.isArray(res.body)).toBeTruthy();
        expect(res.body.length).toBe(0); 
    });

    it('should save a new workspace flow', async () => {
        const payload = {
            name: 'Test Project',
            flow_data: {
                nodes: [{ id: '1', type: 'webcam' }],
                edges: []
            }
        };
        const res = await request(app)
            .post('/api/save-flow')
            .send(payload);
        
        expect(res.statusCode).toEqual(200);
        expect(res.body.created).toBeTruthy();
        expect(res.body.project_id).toBeDefined();
    });

    it('should retrieve the saved workspace', async () => {
        // First save one
        const saveRes = await request(app)
            .post('/api/save-flow')
            .send({ name: 'Retrievable', flow_data: { nodes: [], edges: [] } });
        
        const projectId = saveRes.body.project_id;

        // Then get it
        const res = await request(app).get(`/api/projects/${projectId}/flow`);
        expect(res.statusCode).toEqual(200);
        expect(res.body.name).toBe('Retrievable');
    });

    it('should return 404 for non-existent project', async () => {
        const res = await request(app).get('/api/projects/999/flow');
        expect(res.statusCode).toEqual(404);
    });
});
