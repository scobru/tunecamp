export const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    target.style.display = 'none';
    if (target.nextElementSibling) {
        (target.nextElementSibling as HTMLElement).style.display = 'flex';
    }
};
