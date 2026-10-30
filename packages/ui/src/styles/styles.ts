// The stylesheets every application imports once, at its entry (STD-GLB-FE-005 §3.5): the platform's
// aggregate component stylesheet and its scnx-platform theme, then this package's foundations. The
// platform's stylesheets state the layer order first, the same order _layers.scss states.
import '@scnx/system/styles/components.css';
import '@scnx/system/tokens/css/scnx-platform.css';
import './index.scss';
