import { Routes } from '@angular/router';
import { WelcomePage } from './welcome-page/welcome-page';
import { ButtonPage } from './button-page/button-page';
import { VideoPage } from './video-page/video-page';
import { ApoPinatubo } from './apo-pinatubo/apo-pinatubo';
import { TimelinePage } from './timeline-page/timeline-page';
import { LaharDefensePage } from './lahar-defense-page/lahar-defense-page';
import { SimulatorComponent } from './simulator-component/simulator-component';
import { ApvPage } from './apv-page/apv-page';

export const routes: Routes = [
    { path: '', component: WelcomePage },
    { path: 'menu', component: ButtonPage },
    { path: 'avp', component: ApvPage},
    { path: 'videos', component: VideoPage},
    { path: 'apo-pinatubo', component: ApoPinatubo},
    { path: 'timeline', component: TimelinePage},
    { path: 'lahar-defense', component: LaharDefensePage },
    { path: 'simulator', component: SimulatorComponent },
    { path: '**', redirectTo: 'menu' }
];
