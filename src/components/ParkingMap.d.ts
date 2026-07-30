// Type surface for the platform-split map component.
// Implementations: ParkingMap.native.tsx (Apple/Google maps via react-native-maps)
// and ParkingMap.web.tsx (MapLibre GL — used by the dev/web preview).
import type * as React from 'react';
import type { ParkingMapProps, ParkingMapHandle } from './ParkingMap.shared';

declare const ParkingMap: React.ForwardRefExoticComponent<
  ParkingMapProps & React.RefAttributes<ParkingMapHandle>
>;
export default ParkingMap;
