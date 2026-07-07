export function fixRelativeUrl(url: string | null | undefined): string {
    if (!url) return '';

    if (!url.startsWith('http') && !url.startsWith('/') && !url.startsWith('data:') && !url.startsWith('blob:')) {
        if (url.startsWith('assets/')) {
            return `/api/${url}`;
        } else {
            return `/${url}`;
        }
    }

    return url;
}
