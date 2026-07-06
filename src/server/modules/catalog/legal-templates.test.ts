import { describe, it, expect } from '@jest/globals';
import { buildDefaultTerms, buildDefaultPrivacy } from './legal-templates.js';

describe('legal-templates', () => {
    describe('buildDefaultTerms', () => {
        it('should render correctly with contact email', () => {
            const result = buildDefaultTerms('TestSite', 'test@example.com');
            expect(typeof result).toBe('string');
            expect(result).toContain('TestSite');
            expect(result).toContain('You can reach the operator of this instance at [test@example.com](mailto:test@example.com).');
            expect(result).toContain('# Terms of Service');
            expect(result).toContain('is an independently operated instance');
        });

        it('should render correctly without contact email', () => {
            const result = buildDefaultTerms('TestSite', '');
            expect(typeof result).toBe('string');
            expect(result).toContain('TestSite');
            expect(result).toContain("Contact details for the operator are available on this instance's About or Support page.");
            expect(result).toContain('# Terms of Service');
            expect(result).toContain('is an independently operated instance');
        });

        it('should handle runtime null or undefined safely', () => {
            // @ts-ignore
            const resultNull = buildDefaultTerms('TestSite', null);
            expect(typeof resultNull).toBe('string');
            expect(resultNull).toContain("Contact details for the operator are available on this instance's About or Support page.");

            // @ts-ignore
            const resultUndefined = buildDefaultTerms('TestSite', undefined);
            expect(typeof resultUndefined).toBe('string');
            expect(resultUndefined).toContain("Contact details for the operator are available on this instance's About or Support page.");
        });

        it('should handle runtime null or undefined safely', () => {
            // @ts-ignore
            const resultNull = buildDefaultTerms('TestSite', null);
            expect(typeof resultNull).toBe('string');
            expect(resultNull).toContain("Contact details for the operator are available on this instance's About or Support page.");

            // @ts-ignore
            const resultUndefined = buildDefaultTerms('TestSite', undefined);
            expect(typeof resultUndefined).toBe('string');
            expect(resultUndefined).toContain("Contact details for the operator are available on this instance's About or Support page.");
        });
    });

    describe('buildDefaultPrivacy', () => {
        it('should render correctly with contact email', () => {
            const result = buildDefaultPrivacy('TestSite', 'test@example.com');
            expect(typeof result).toBe('string');
            expect(result).toContain('TestSite');
            expect(result).toContain('You can reach the operator of this instance at [test@example.com](mailto:test@example.com).');
            expect(result).toContain('# Privacy Policy');
            expect(result).toContain('This policy describes how');
        });

        it('should render correctly without contact email', () => {
            const result = buildDefaultPrivacy('TestSite', '');
            expect(typeof result).toBe('string');
            expect(result).toContain('TestSite');
            expect(result).toContain("Contact details for the operator are available on this instance's About or Support page.");
            expect(result).toContain('# Privacy Policy');
            expect(result).toContain('This policy describes how');
        });

        it('should handle runtime null or undefined safely', () => {
            // @ts-ignore
            const resultNull = buildDefaultPrivacy('TestSite', null);
            expect(typeof resultNull).toBe('string');
            expect(resultNull).toContain("Contact details for the operator are available on this instance's About or Support page.");

            // @ts-ignore
            const resultUndefined = buildDefaultPrivacy('TestSite', undefined);
            expect(typeof resultUndefined).toBe('string');
            expect(resultUndefined).toContain("Contact details for the operator are available on this instance's About or Support page.");
        });

        it('should handle runtime null or undefined safely', () => {
            // @ts-ignore
            const resultNull = buildDefaultPrivacy('TestSite', null);
            expect(typeof resultNull).toBe('string');
            expect(resultNull).toContain("Contact details for the operator are available on this instance's About or Support page.");

            // @ts-ignore
            const resultUndefined = buildDefaultPrivacy('TestSite', undefined);
            expect(typeof resultUndefined).toBe('string');
            expect(resultUndefined).toContain("Contact details for the operator are available on this instance's About or Support page.");
        });
    });
});
