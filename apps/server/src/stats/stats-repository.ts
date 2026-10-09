import { PageStat } from '@koinsight/common/types/page-stat';
import { DeviceRepository } from '../devices/device-repository';
import { db } from '../knex';

export class StatsRepository {
  private static updateStartTime(stat: PageStat): PageStat {
    return { ...stat, start_time: stat.start_time * 1000 };
  }

  static async getAll(userId: number): Promise<PageStat[]> {
    const stats = await db<PageStat>('page_stat')
      .join('book', 'page_stat.book_md5', 'book.md5')
      .where({ 'book.soft_deleted': false })
      .whereIn('page_stat.device_id', DeviceRepository.idsForUser(userId))
      .select('page_stat.*');

    return stats.map(this.updateStartTime);
  }

  static async getByBookMD5(book_md5: string, userId?: number): Promise<PageStat[]> {
    let query = db<PageStat>('page_stat').where({ book_md5 });

    if (userId !== undefined) {
      query = query.whereIn('device_id', DeviceRepository.idsForUser(userId));
    }

    const bookStats = await query;
    return bookStats.map(this.updateStartTime);
  }

  static async insert(data: PageStat): Promise<number[]> {
    return db<PageStat>('page_stat').insert(data);
  }

  static async update(
    book_md5: string,
    device_id: string,
    page: number,
    start_time: number,
    data: Partial<PageStat>
  ): Promise<number> {
    return db<PageStat>('page_stat').where({ book_md5, device_id, page, start_time }).update(data);
  }
}
