import { useState, useEffect } from 'react';
import { quotes } from '../data/quotes';

interface QuotesSidebarProps {
    side: 'left' | 'right';
}

export function QuotesSidebar({ side }: QuotesSidebarProps) {
    const [currentQuoteIndex, setCurrentQuoteIndex] = useState(() => {
        // Start with a random index, ensuring left and right are likely different
        return Math.floor(Math.random() * quotes.length);
    });
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        // Add a slight delay to the right side so they don't change at the exact same moment
        const initialDelay = side === 'right' ? 2000 : 0;

        const timeout = setTimeout(() => {
            const interval = setInterval(() => {
                setIsVisible(false);
                setTimeout(() => {
                    setCurrentQuoteIndex((prev) => (prev + 1) % quotes.length);
                    setIsVisible(true);
                }, 1000);
            }, 12000); // Slightly longer interval (12s) for a more relaxed feel

            return () => clearInterval(interval);
        }, initialDelay);

        return () => clearTimeout(timeout);
    }, [side]);

    return (
        <div className={`quotes-sidebar ${side}`}>
            <div className={`quote-container ${isVisible ? 'visible' : 'hidden'}`}>
                <p className="quote-text">{quotes[currentQuoteIndex]}</p>
            </div>
        </div>
    );
}
