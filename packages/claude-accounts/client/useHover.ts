import { useState } from 'react';

/** `Pressable` has no hover style of its own, so its hover events drive a local state. */
export function useHover() {
    const [hovered, setHovered] = useState(false);

    return {
        hovered,
        hoverProps: {
            onHoverIn: () => setHovered(true),
            onHoverOut: () => setHovered(false),
        },
    };
}
