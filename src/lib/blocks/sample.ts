import type { BlockNode } from './render';

/**
 * A representative stored document for the SP0 spike, expressed as a block tree
 * (the structured array `onSaveBlocks` emits). Stands in for what a PDS `content`
 * record will hold (SP2). It is rendered with the dependency-free `render.ts`
 * — no `@wordpress` on the reading path — and locked by `render.test.ts`.
 */
export const SAMPLE_TREE: BlockNode[] = [
	{
		name: 'core/heading',
		attributes: { level: 1, content: "The open sky meets the typesetter's bench" },
		innerBlocks: [],
	},
	{
		name: 'core/paragraph',
		attributes: {
			content:
				'SkyPress is a standalone, long-form writing studio for the AT&nbsp;Protocol. You write in blocks; your words are saved to your own server.',
		},
		innerBlocks: [],
	},
	{
		name: 'core/heading',
		attributes: { level: 2, content: 'Why blocks &amp; why your own server' },
		innerBlocks: [],
	},
	{
		name: 'core/list',
		attributes: { ordered: false },
		innerBlocks: [
			{
				name: 'core/list-item',
				attributes: { content: 'Your data lives on your PDS, not ours.' },
				innerBlocks: [],
			},
			{
				name: 'core/list-item',
				attributes: {
					content: 'Rendered with the <strong>same</strong> packages that wrote it.',
				},
				innerBlocks: [],
			},
		],
	},
	{
		name: 'core/quote',
		attributes: {},
		innerBlocks: [
			{
				name: 'core/paragraph',
				attributes: { content: 'A place to write things worth keeping.' },
				innerBlocks: [],
			},
		],
	},
	{
		name: 'core/code',
		attributes: {
			content: 'agent.com.atproto.repo.createRecord( { collection, record } )',
		},
		innerBlocks: [],
	},
	{ name: 'core/separator', attributes: {}, innerBlocks: [] },
];
