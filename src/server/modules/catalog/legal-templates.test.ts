import { describe, it, expect } from '@jest/globals';
import { buildDefaultTerms, buildDefaultPrivacy } from './legal-templates.js';

describe('legal-templates', () => {
    describe('buildDefaultTerms', () => {
        it('should render correctly with contact email', () => {
            const result = buildDefaultTerms('TestSite', 'test@example.com');
            expect(result).toContain('TestSite');
            expect(result).toContain('You can reach the operator of this instance at [test@example.com](mailto:test@example.com).');
            expect(result).toContain('# Terms of Service');
        });

        it('should render correctly without contact email', () => {
            const result = buildDefaultTerms('TestSite', '');
            expect(result).toContain('TestSite');
            expect(result).toContain("Contact details for the operator are available on this instance's About or Support page.");
            expect(result).toContain('# Terms of Service');
        });
    });

    describe('buildDefaultPrivacy', () => {
        it('should render correctly with contact email', () => {
            const result = buildDefaultPrivacy('TestSite', 'test@example.com');
            expect(result).toContain('TestSite');
            expect(result).toContain('You can reach the operator of this instance at [test@example.com](mailto:test@example.com).');
            expect(result).toContain('# Privacy Policy');
        });

        it('should render correctly without contact email', () => {
            const result = buildDefaultPrivacy('TestSite', '');
            expect(result).toContain('TestSite');
            expect(result).toContain("Contact details for the operator are available on this instance's About or Support page.");
            expect(result).toContain('# Privacy Policy');
        });
    });
});
