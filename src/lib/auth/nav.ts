/** The page an AppBar renders on; selects its contextual nav action. */
export type AppBarContext = 'editor' | 'dashboard';

export interface AppBarNav {
	href: string;
	label: string;
	icon: 'feather' | 'publications';
}

/**
 * The AppBar's single contextual nav action, by the page it renders on:
 *   editor    → back to your publications (the dashboard)
 *   dashboard → into the editor (a feather "Write")
 */
export function appBarNav( current: AppBarContext ): AppBarNav {
	if ( current === 'dashboard' ) {
		return { href: '/editor', label: 'Write', icon: 'feather' };
	}
	return { href: '/dashboard', label: 'Publications', icon: 'publications' };
}
