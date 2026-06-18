import { jest } from '@jest/globals';

const fetchMock = jest.fn();
export default fetchMock;
export { fetchMock as fetch };
export class Response {
    ok: boolean;
    status: number;
    statusText: string;
    body: any;
    constructor(body?: any, init?: any) {
        this.ok = (init?.status ?? 200) >= 200 && (init?.status ?? 200) < 300;
        this.status = init?.status ?? 200;
        this.statusText = init?.statusText ?? 'OK';
        this.body = body;
    }
    async json() { return JSON.parse(this.body); }
    async text() { return String(this.body); }
}
export const RequestInit = {};
