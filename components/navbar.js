import { useState } from "react"
import Link from 'next/link'
import Image from 'next/image'
import { useSession, signOut } from 'next-auth/react'
import scaleIcon from '../public/weighing-scale-64.png'

export default function Navbar() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { data: session, status } = useSession();

    function closeMenu() { setIsMenuOpen(false) };

    return (
        <nav className="navbar is-primary" role="navigation" aria-label="main navigation">
            <div className="navbar-brand">
                <Link href="/" passHref onClick={closeMenu} className="navbar-item">
                    <Image
                        src={scaleIcon}
                        alt="scale logo"
                        width={32}
                        height={32}
                    />
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
                <div className="navbar-start">
                    <Link href="/cloud/xiaomiCloud" passHref onClick={closeMenu} className="navbar-item">
                        Mi Cloud Connector (S400)
                    </Link>
                </div>

                <div className="navbar-end">
                    <div className="navbar-item">
                        {status === 'authenticated' && (
                            <div className="buttons">
                                <span className="navbar-item px-0 has-text-white-ter is-size-7">{session.user?.email}</span>
                                <a href="#" onClick={(e) => { e.preventDefault(); closeMenu(); signOut(); }}
                                    className="button is-primary is-outlined is-small">
                                    Log Out
                                </a>
                            </div>
                        )}
                        {status === 'unauthenticated' && (
                            <div className="buttons">
                                <Link href="/login" onClick={closeMenu} className="button is-primary is-outlined is-small">
                                    Log In
                                </Link>
                                <Link href="/register" onClick={closeMenu} className="button is-light is-small">
                                    Register
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    )
}
