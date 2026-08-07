import { useEffect, useState } from "react"
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'

export default function Navbar() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { data: session, status } = useSession();
    // Bulma's dark mode follows the OS/browser prefers-color-scheme by default —
    // this lets the user override that explicitly instead, via Bulma's documented
    // data-theme attribute (https://bulma.io/documentation/features/dark-mode/).
    // Starts null (no override, i.e. "follow system") until we know what's stored.
    const [theme, setTheme] = useState(null);

    useEffect(() => {
        const stored = window.localStorage.getItem('theme');
        if (stored === 'light' || stored === 'dark') {
            setTheme(stored);
            document.documentElement.setAttribute('data-theme', stored);
        }
    }, []);

    const toggleTheme = () => {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const current = theme || (systemPrefersDark ? 'dark' : 'light');
        const next = current === 'dark' ? 'light' : 'dark';
        setTheme(next);
        window.localStorage.setItem('theme', next);
        document.documentElement.setAttribute('data-theme', next);
    };

    function closeMenu() { setIsMenuOpen(false) };

    return (
        <nav className="navbar is-primary" role="navigation" aria-label="main navigation">
            <div className="navbar-brand">
                <Link href="/" passHref onClick={closeMenu} className="navbar-item">
                    {/* Our own mark (not the stock scale icon this fork started with —
                        see TODO.md). Drawn inline rather than public/logo.svg here
                        specifically: on the is-primary bar itself, a translucent white
                        fill reads as part of the bar instead of a boxed sticker sitting
                        on top of it; the solid-teal version (public/logo.svg) is for
                        contexts with a non-teal background, e.g. the favicon. */}
                    <svg width="28" height="28" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <rect x="2" y="2" width="60" height="60" rx="14" fill="#ffffff" fillOpacity="0.16" />
                        <text x="32" y="44.5" textAnchor="middle" fontFamily="-apple-system, 'Segoe UI', Roboto, Arial, sans-serif" fontWeight="800" fontSize="33" fill="#ffffff">W</text>
                    </svg>
                    <span className="ml-2 has-text-weight-semibold">Web Body Composition</span>
                </Link>

                <a
                    role="button"
                    className={`navbar-burger ${isMenuOpen ? 'is-active' : ''}`}
                    aria-label="menu"
                    aria-expanded={isMenuOpen}
                    onClick={() => setIsMenuOpen((v) => !v)}
                >
                    <span aria-hidden="true"></span>
                    <span aria-hidden="true"></span>
                    <span aria-hidden="true"></span>
                </a>
            </div>

            <div className={`navbar-menu ${isMenuOpen ? 'is-active' : ''}`}>
                <div className="navbar-end">
                    <div className="navbar-item">
                        {/* Single Bulma "buttons" group — its own spacing rules handle the
                            gaps, so nothing here needs a manual margin/gap style.
                            All buttons use is-light — Bulma's own basic-navbar example
                            (bulma.io/documentation/components/navbar) pairs a colored
                            navbar with is-light buttons for guaranteed contrast; an
                            is-outlined is-primary button on an is-primary bar is
                            unreadable since its text is the same hue as the background. */}
                        <div className="buttons is-align-items-center">
                            <button
                                type="button"
                                onClick={toggleTheme}
                                className="button is-light is-small"
                                aria-label="Toggle light/dark theme"
                                title="Toggle light/dark theme"
                            >
                                {theme === 'dark' ? '☀️' : theme === 'light' ? '🌙' : '🌓'}
                            </button>
                            {/* Only shown once authenticated — logged-out visitors are always
                                on /login or /register already (middleware.js redirects them
                                there), and both pages have their own Log In/Register links,
                                so repeating them here was redundant. */}
                            {status === 'authenticated' && (
                                <>
                                    <span className="navbar-item px-0 has-text-white-ter is-size-7">{session.user?.email}</span>
                                    <a href="#" onClick={(e) => { e.preventDefault(); closeMenu(); signOut(); }}
                                        className="button is-light is-small">
                                        Log Out
                                    </a>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    )
}
