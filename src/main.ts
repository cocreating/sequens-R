import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import { preparePhase7LibraryRelease } from './lib/project/release-reset';
import './styles/index.css';

async function bootstrap(): Promise<void> {
  try {
    await preparePhase7LibraryRelease();
  } catch (error) {
    console.error('Phase 7 library reset could not be completed.', error);
  }
  registerSW({ immediate: true });
  mount(App, { target: document.querySelector('#app')! });
}

void bootstrap();
