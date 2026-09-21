import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ApvPage } from './apv-page';

describe('ApvPage', () => {
  let component: ApvPage;
  let fixture: ComponentFixture<ApvPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ApvPage],
    }).compileComponents();

    fixture = TestBed.createComponent(ApvPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
