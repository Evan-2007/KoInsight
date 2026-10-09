import { Device } from '@koinsight/common/types/device';
import { User } from '@koinsight/common/types/user';
import { db } from '../knex';

export class DeviceOwnedByOtherUserError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'DeviceOwnedByOtherUserError';
  }
}

export class DeviceRepository {
  static async getAll(): Promise<Device[]> {
    return db<Device>('device').select('*');
  }

  static async getAllForUser(user_id: User['id']): Promise<Device[]> {
    return db<Device>('device').where({ user_id }).select('*');
  }

  /**
   * Subquery selecting the ids of all devices owned by a user, for scoping queries
   */
  static idsForUser(user_id: User['id']) {
    return db('device').select('id').where({ user_id });
  }

  /**
   * Registers a device for a user. Unowned devices are claimed, devices owned by
   * another user are rejected.
   */
  static async registerForUser(device: Device, user_id: User['id']): Promise<void> {
    const existingDevice = await this.getById(device.id);

    if (!existingDevice) {
      await db<Device>('device').insert({ ...device, user_id });
    } else if (existingDevice.user_id == null) {
      await db<Device>('device').where({ id: device.id }).update({ user_id });
    } else if (existingDevice.user_id !== user_id) {
      throw new DeviceOwnedByOtherUserError();
    }
  }

  static async getById(id: string): Promise<Device | undefined> {
    return db<Device>('device').where({ id }).first();
  }

  static async getByModel(model: string): Promise<Device | undefined> {
    return db<Device>('device').where({ model }).first();
  }

  static async insertIfNotExists(device: Device): Promise<void> {
    const existingDevice = await this.getById(device.id);

    if (!existingDevice) {
      await db<Device>('device').insert(device);
    }
  }

  static async findOrCreateByModel(model: Device['model']): Promise<Device> {
    const existingDevice = await db<Device>('device').where({ model }).first();

    if (existingDevice) {
      return existingDevice;
    }

    const [result] = await db<Device>('device').insert({ model }).returning('*');
    return result;
  }
}
