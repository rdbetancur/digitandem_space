// Mission Control for room guests (every crew seat except the pilot, who hosts the room).
// Guests see the pilot's game, so the assistant gets that context: the mirrored live flight
// while the pilot flies, and the pilot's screen, mission and craft while they do not.

import { useEffect } from 'react';
import { MISSIONS, Mission } from '../../sim/missions';
import MissionControl from '../MissionControl';
import { describeFlight, setFlightContext } from '../missionControlContext';
import { roomGuestFlight, useRoom } from './room';

function missionFor(id: string | undefined, name: string | undefined): Mission {
  if (id && MISSIONS[id]) return MISSIONS[id];
  return Object.values(MISSIONS).find((m) => m.nombre === name) ?? MISSIONS.sandbox;
}

export default function GuestMissionControl() {
  const room = useRoom();
  const g = room.flying ? roomGuestFlight() : null;
  const mission = missionFor(g?.missionId, room.idle?.missionName);

  // While the pilot flies, Mission Control reads the guest's mirrored copy of the flight.
  useEffect(() => {
    if (!room.flying) return;
    setFlightContext(() => {
      const live = roomGuestFlight();
      return live ? describeFlight(live.f, missionFor(live.missionId, undefined)) : '';
    });
    return () => setFlightContext(null);
  }, [room.flying]);

  const idle = room.idle?.screen;
  const screen = room.flying ? (mission.id === 'luna' ? 'luna' : 'flight') : idle === 'lab' || idle === 'report' ? idle : 'home';
  const design = g?.f.design ?? room.idle?.design ?? mission.preset;
  // The guest has no full report, only the pilot's result line, so the report screen sends no report.
  return <MissionControl screen={screen} mission={mission} design={design} report={null} />;
}
