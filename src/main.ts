import { Notice, Plugin } from 'obsidian';

export default class SpecoratorPlugin extends Plugin {
	async onload() {
		console.log('Specorator: loading');

		this.addCommand({
			id: 'specorator-status',
			name: 'Show Specorator status',
			callback: () => {
				new Notice('Specorator is loaded and ready.');
			},
		});
	}

	async onunload() {
		console.log('Specorator: unloading');
	}
}
