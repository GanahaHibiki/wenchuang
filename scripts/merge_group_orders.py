#!/usr/bin/env python3
"""
合并两个拼单订单的脚本
使用方法: python scripts/merge_group_orders.py
"""

import json
import os
import shutil
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
DB_PATH = os.path.join(DATA_DIR, 'db.json')
BACKUP_DIR = os.path.join(DATA_DIR, 'backups')


def load_db():
    with open(DB_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_db(db):
    # 创建备份
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now().strftime('%Y-%m-%dT%H-%M-%S')
    backup_path = os.path.join(BACKUP_DIR, f'db_{timestamp}_before_merge.json')
    shutil.copy(DB_PATH, backup_path)
    print(f'已创建备份: {backup_path}')

    # 保存
    db['lastModified'] = datetime.now().isoformat()
    with open(DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)


def get_group_orders(db):
    """获取所有拼单订单，按界面显示的序号排序"""
    group_orders = [o for o in db['orders'] if o.get('orderType') == 'group']
    # 按 createdAt 排序来确定显示序号
    group_orders.sort(key=lambda x: x.get('createdAt', ''))
    return group_orders


def get_group_sequence_number(db, order_id):
    """获取拼单订单在界面上显示的序号（从1开始）"""
    group_orders = get_group_orders(db)
    for i, order in enumerate(group_orders):
        if order['id'] == order_id:
            return i + 1
    return None


def find_order_by_group_seq(db, group_seq):
    """根据拼单序号找到订单"""
    group_orders = get_group_orders(db)
    if 1 <= group_seq <= len(group_orders):
        return group_orders[group_seq - 1]
    return None


def list_group_orders(db):
    """列出所有拼单订单"""
    group_orders = get_group_orders(db)
    shop_map = {s['id']: s['name'] for s in db['shops']}

    print('\n当前所有拼单订单：')
    print('=' * 60)

    for i, order in enumerate(group_orders):
        seq = i + 1
        shops = [shop_map.get(sid, '未知') for sid in order.get('shopIds', [])]
        shop_str = ', '.join(shops)
        amt = order['totalAmount']
        item_count = len(order['items'])

        print(f'拼单序号 {seq}')
        print(f'  店铺: {shop_str}')
        print(f'  商品数: {item_count} | 金额: {amt:.2f}')
        print()

    print('=' * 60)
    return group_orders


def merge_orders(db, target_order, source_order):
    """将 source_order 合并到 target_order"""
    # 1. 合并 shopIds（去重）
    existing_shop_ids = set(target_order.get('shopIds', []))
    for shop_id in source_order.get('shopIds', []):
        if shop_id not in existing_shop_ids:
            target_order['shopIds'].append(shop_id)
            existing_shop_ids.add(shop_id)

    # 2. 合并 items
    target_order['items'].extend(source_order['items'])

    # 3. 重新计算金额
    total_amount = 0
    for item in target_order['items']:
        for spec in item.get('specifications', []):
            qty = spec.get('quantity', 0)
            price = spec.get('purchasePrice', 0) or spec.get('originalPrice', 0)
            total_amount += qty * price

    target_order['totalAmount'] = total_amount
    # 拼单订单通常没有礼品和小礼物
    target_order['giftTotal'] = 0
    target_order['smallGiftTotal'] = 0
    target_order['giftRatio'] = 0

    # 4. 从 orders 中删除 source_order
    db['orders'] = [o for o in db['orders'] if o['id'] != source_order['id']]

    # 5. 重新排序 sequenceNumber
    db['orders'].sort(key=lambda x: x.get('createdAt', ''))
    for i, order in enumerate(db['orders']):
        order['sequenceNumber'] = i + 1

    return target_order


def main():
    db = load_db()

    # 列出所有拼单订单
    group_orders = list_group_orders(db)

    if len(group_orders) < 2:
        print('拼单订单数量不足2个，无法合并')
        return

    # 获取用户输入
    print('请输入要合并的两个拼单订单序号')
    print('（第二个订单的内容会合并到第一个订单中，第二个订单会被删除）')
    print()

    try:
        target_seq = int(input('目标订单序号（保留）: ').strip())
        source_seq = int(input('来源订单序号（删除）: ').strip())
    except ValueError:
        print('输入无效，请输入数字')
        return

    if target_seq == source_seq:
        print('不能选择相同的订单')
        return

    target_order = find_order_by_group_seq(db, target_seq)
    source_order = find_order_by_group_seq(db, source_seq)

    if not target_order:
        print(f'找不到拼单序号 {target_seq} 的订单')
        return

    if not source_order:
        print(f'找不到拼单序号 {source_seq} 的订单')
        return

    # 显示合并预览
    shop_map = {s['id']: s['name'] for s in db['shops']}

    print('\n合并预览：')
    print('-' * 40)

    target_shops = [shop_map.get(sid, '未知') for sid in target_order.get('shopIds', [])]
    source_shops = [shop_map.get(sid, '未知') for sid in source_order.get('shopIds', [])]

    print(f'目标订单 (序号{target_seq}): {len(target_order["items"])}个商品, {target_order["totalAmount"]:.2f}元')
    print(f'  店铺: {", ".join(target_shops)}')
    print()
    print(f'来源订单 (序号{source_seq}): {len(source_order["items"])}个商品, {source_order["totalAmount"]:.2f}元')
    print(f'  店铺: {", ".join(source_shops)}')
    print()

    merged_item_count = len(target_order['items']) + len(source_order['items'])
    merged_amount = target_order['totalAmount'] + source_order['totalAmount']

    # 计算合并后的店铺
    all_shop_ids = set(target_order.get('shopIds', []))
    all_shop_ids.update(source_order.get('shopIds', []))
    merged_shops = [shop_map.get(sid, '未知') for sid in all_shop_ids]

    print(f'合并后: {merged_item_count}个商品, 约{merged_amount:.2f}元')
    print(f'  店铺: {", ".join(merged_shops)}')
    print('-' * 40)

    # 确认
    confirm = input('\n确认合并？(y/n): ').strip().lower()
    if confirm != 'y':
        print('已取消')
        return

    # 执行合并
    merge_orders(db, target_order, source_order)
    save_db(db)

    print('\n合并完成！')
    print(f'拼单序号 {source_seq} 的内容已合并到序号 {target_seq}')
    print('请刷新页面查看结果')


if __name__ == '__main__':
    main()
