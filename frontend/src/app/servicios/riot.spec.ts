import { TestBed } from '@angular/core/testing';

import { Riot } from './riot';

describe('Riot', () => {
  let service: Riot;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Riot);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
