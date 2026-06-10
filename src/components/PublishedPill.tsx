interface Props {
	/** Public reading-page URL of the just-published / updated article. */
	url: string;
	/** True when an existing article was updated (vs. a brand-new publish). */
	isEditing: boolean;
}

/**
 * Glanceable confirmation that a publish/update finished, with a link to the
 * live article. Rendered by Studio ABOVE the editor's keyed remount boundary so
 * it survives the post-publish reset (a pill inside PublishPanel would be wiped).
 */
export default function PublishedPill( { url, isEditing }: Props ) {
	return (
		<p className="studio__published" role="status">
			<span className="studio__published-label">
				🌅 { isEditing ? 'Updated' : "It's live" }
			</span>
			<a
				className="studio__published-link"
				href={ url }
				target="_blank"
				rel="noopener noreferrer"
			>
				Read it →
			</a>
		</p>
	);
}
