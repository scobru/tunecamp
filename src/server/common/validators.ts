export interface ValidationResult {
    valid: boolean;
    error?: string;
}

export function validatePassword(password: string): ValidationResult {
    if (!password) {
        return { valid: false, error: "Password is required" };
    }

    if (password.length < 8) {
        return { valid: false, error: "Password must be at least 8 characters long" };
    }

    return { valid: true };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): ValidationResult {
    if (!email || !EMAIL_RE.test(email)) {
        return { valid: false, error: "Invalid email address" };
    }
    return { valid: true };
}
