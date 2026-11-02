import {makeAutoObservable} from 'mobx';

class MockModelUpdateStore {
  enabled = true;
  failedIds: string[] = [];
  pendingId: string | null = null;
  setEnabled: jest.Mock;
  run: jest.Mock;

  constructor() {
    makeAutoObservable(this, {setEnabled: false, run: false});
    this.setEnabled = jest.fn((value: boolean) => {
      this.enabled = value;
    });
    this.run = jest.fn();
  }
}

export const mockModelUpdateStore = new MockModelUpdateStore();
