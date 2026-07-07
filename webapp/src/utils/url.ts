export function fixRelativeUrl(url: string | null | undefined): string {
    if (!url) return '';

    if (!url.startsWith('http') && !url.startsWith('/') && !url.startsWith('data:') && !url.startsWith('blob:')) {
        if (url.startsWith('api/')) {
            return `/${url}`;
        }

        const apiPrefixes = ['assets/', 'tracks/', 'albums/', 'releases/', 'artists/'];
        if (apiPrefixes.some(prefix => url.startsWith(prefix))) {
            return `/api/${url}`;
        } else {
            return `/${url}`;
        }
    }

    return url;
}
