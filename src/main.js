import { Shell } from './core/shell.js';
import { registerGame } from './core/registry.js';
import './games/catchmon/index.js';

// Placeholders so the menu shows where the collection is heading.
registerGame({
  id: 'stackomat',
  name: 'Stack-o-Mat',
  tagline: 'Time your drops and build the tallest tower.',
  status: 'coming-soon',
  create: () => {
    throw new Error('Not implemented yet');
  },
});

const shell = new Shell();
shell.showMenu();

// Handy while developing in the browser console.
window.minigameMania = shell;
