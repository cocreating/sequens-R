import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import './styles/index.css';

registerSW({ immediate: true });

mount(App, { target: document.querySelector('#app')! });
