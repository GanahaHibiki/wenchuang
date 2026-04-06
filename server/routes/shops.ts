import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getAllShops, createShop } from '../services/database.js'

const router = Router()

// GET /api/shops
router.get('/', async (req, res, next) => {
  try {
    const shops = await getAllShops()
    // Filter out the special "拼单" shop used for group orders
    const filteredShops = shops.filter(shop => shop.name !== '拼单')
    res.json(filteredShops)
  } catch (err) {
    next(err)
  }
})

// POST /api/shops
router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: '店铺名称不能为空' })
    }

    const shop = await createShop({
      id: uuidv4(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
    })

    res.status(201).json(shop)
  } catch (err) {
    next(err)
  }
})

export default router
