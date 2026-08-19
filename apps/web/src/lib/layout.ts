/**
 * Shared page width. Applied once in the app layout around the route outlet.
 * Do not add transform, filter, contain, or overflow clipping on this wrapper —
 * those would trap `position: fixed` dialog backdrops if a portal is missing.
 */
export const PAGE_CONTAINER_CLASS = "container mx-auto w-full"
