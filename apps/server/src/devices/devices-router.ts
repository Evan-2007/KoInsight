import { Request, Response, Router } from 'express';
import { DeviceRepository } from '../devices/device-repository';
const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const devices = await DeviceRepository.getAllForUser(req.user!.id);
  res.status(200).json(devices);
});

export { router as devicesRouter };
