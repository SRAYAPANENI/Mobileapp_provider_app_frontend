import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MyVehicles, NewVehicle, NewVehicleDocument, SkoFyApi } from '@/services/api';
import { qk } from './keys';

// The provider's vehicles (docs/VEHICLES_DESIGN.md). Every change answers
// with the whole list, which is put straight in the cache; Rates & hosting
// shows whether car-trunk and van trips reach them, so it's refreshed too.

export function useMyVehicles() {
  return useQuery({ queryKey: qk.provider.vehicles, queryFn: () => SkoFyApi.vehicles.mine() });
}

function useSaveVehicles<A>(fn: (args: A) => Promise<MyVehicles>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (mine: MyVehicles) => {
      client.setQueryData(qk.provider.vehicles, mine);
      client.invalidateQueries({ queryKey: qk.provider.hosting });
    },
  });
}

export const useAddVehicle = () => useSaveVehicles((v: NewVehicle) => SkoFyApi.vehicles.add(v));
export const useAddVehicleDocument = () =>
  useSaveVehicles(({ vehicleId, doc }: { vehicleId: string; doc: NewVehicleDocument }) =>
    SkoFyApi.vehicles.addDocument(vehicleId, doc));
export const useRemoveVehicle = () => useSaveVehicles((vehicleId: string) => SkoFyApi.vehicles.remove(vehicleId));
