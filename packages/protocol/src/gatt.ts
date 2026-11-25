import { schema } from './schema';

export const GATT = {
  service: schema.gatt.service,
  cmdToStrap: schema.gatt.cmd_to_strap,
  cmdFromStrap: schema.gatt.cmd_from_strap,
  eventsFromStrap: schema.gatt.events_from_strap,
  dataFromStrap: schema.gatt.data_from_strap,
  heartRateService: '0000180d-0000-1000-8000-00805f9b34fb',
  heartRateMeasurement: schema.gatt.standard_heart_rate_measurement,
  deviceInformationService: '0000180a-0000-1000-8000-00805f9b34fb',
  firmwareRevision: '00002a26-0000-1000-8000-00805f9b34fb',
  serialNumber: '00002a25-0000-1000-8000-00805f9b34fb',
  modelNumber: '00002a24-0000-1000-8000-00805f9b34fb',
  batteryService: '0000180f-0000-1000-8000-00805f9b34fb',
  batteryLevel: '00002a19-0000-1000-8000-00805f9b34fb',
} as const;
