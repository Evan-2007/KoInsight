import { KoReaderAnnotation } from '@koinsight/common/types/annotation';
import { KoReaderBook } from '@koinsight/common/types/book';
import { Device } from '@koinsight/common/types/device';
import { PageStat } from '@koinsight/common/types/page-stat';
import archiver from 'archiver';
import { NextFunction, Request, Response, Router } from 'express';
import path from 'path';
import { DeviceOwnedByOtherUserError, DeviceRepository } from '../devices/device-repository';
import { authenticate } from '../kosync/kosync-authenticate-middleware';
import { UploadService } from '../upload/upload-service';

// Router for KoInsight koreader plugin
const router = Router();

export const REQUIRED_PLUGIN_VERSION = '0.4.0';

const rejectOldPluginVersion = (req: Request, res: Response, next: NextFunction) => {
  const { version } = req.body;

  if (!version || version !== REQUIRED_PLUGIN_VERSION) {
    res.status(400).json({
      error: `Unsupported plugin version. Version must be ${REQUIRED_PLUGIN_VERSION}. Please update your KOReader koinsight.koplugin`,
    });
    return;
  }

  next();
};

router.post('/device', rejectOldPluginVersion, authenticate, async (req, res) => {
  const { id, model } = req.body;

  if (!id || !model) {
    res.status(400).json({ error: 'Missing device ID or model' });
    return;
  }

  const device: Device = { id, model };

  try {
    console.debug('Registering device:', device);
    await DeviceRepository.registerForUser(device, req.user!.id);
    res.status(200).json({ message: 'Device registered successfully' });
  } catch (err) {
    if (err instanceof DeviceOwnedByOtherUserError) {
      res.status(403).json({ error: 'Device is registered to another user' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Error registering device' });
  }
});

router.post('/import', rejectOldPluginVersion, authenticate, async (req, res) => {
  const contentLength = req.headers['content-length'];
  console.warn(`[${req.method}] ${req.url} — Content-Length: ${contentLength || 'unknown'} bytes`);

  const koreaderBooks: KoReaderBook[] = req.body.books;
  const newPageStats: PageStat[] = req.body.stats;
  const annotations: Record<string, KoReaderAnnotation[]> = req.body.annotations || {};
  const deviceId: string | undefined = req.body.device_id; // For annotation sync path

  // Every device referenced by the import must belong to the authenticated user
  const deviceIds = new Set<string>(
    (Array.isArray(newPageStats) ? newPageStats : [])
      .map((stat) => stat?.device_id)
      .filter((id): id is string => Boolean(id))
  );
  if (deviceId) {
    deviceIds.add(deviceId);
  }
  if (deviceIds.size === 0) {
    res.status(400).json({ error: 'Missing device ID' });
    return;
  }
  for (const id of deviceIds) {
    const device = await DeviceRepository.getById(id);
    if (!device || device.user_id !== req.user!.id) {
      res.status(403).json({ error: `Device ${id} is not registered to this user` });
      return;
    }
  }

  try {
    console.debug('Importing books:', koreaderBooks);
    console.debug('Importing page stats:', newPageStats);
    console.debug(
      'Importing annotations:',
      Object.keys(annotations).length,
      'books with annotations'
    );

    await UploadService.uploadStatisticData(koreaderBooks, newPageStats, annotations, deviceId);
    res.status(200).json({ message: 'Upload successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error importing data' });
  }
});

// TODO: implement check in koreader plugin
router.get('/health', rejectOldPluginVersion, async (_, res) => {
  res.status(200).json({ message: 'Plugin is healthy' });
});

router.get('/download', (_, res) => {
  const folderPath = path.join(__dirname, '../../../../', 'plugins');
  const archive = archiver('zip', { zlib: { level: 9 } });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename=koinsight.plugin.zip');

  archive.on('error', (err) => {
    console.error('Archive error:', err);
    res.status(500).send('Error creating zip');
  });

  // Pipe the archive directly to the response
  archive.pipe(res);

  // Add folder contents to the archive
  archive.directory(folderPath, false);

  archive.finalize();
});

export { router as kopluginRouter };
