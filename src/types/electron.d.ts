import type { ProjectFileBridge } from './index';

declare global {
  interface Window {
    plotDigitizer?: ProjectFileBridge;
  }
}

export {};
