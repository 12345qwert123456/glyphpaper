#!/usr/bin/env python3
"""Рисует иконки расширения (icons/icon-*.png): мозаичная бабочка на тёмном фоне.
Нужен Pillow. Запуск из корня репозитория: python3 tools/make_icons.py"""
from PIL import Image, ImageDraw

BG = (11, 13, 19, 255)
SHADES = {1: (27, 63, 143), 2: (47, 111, 214), 3: (143, 208, 255), 4: (19, 42, 102)}
PATTERN = [
    "011000110",
    "122101221",
    "123242321",
    "012242210",
    "001242100",
    "012242210",
    "012101210",
    "001000100",
]


def icon(size):
    scale = 8                                   # рисуем крупно и уменьшаем — края получаются мягкими
    s = size * scale
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.22), fill=BG)
    cols, rows = len(PATTERN[0]), len(PATTERN)
    cell = s * 0.84 / cols
    ox, oy = (s - cell * cols) / 2, (s - cell * rows) / 2
    gap = cell * 0.1
    for j, row in enumerate(PATTERN):
        for i, ch in enumerate(row):
            if ch == "0":
                continue
            x, y = ox + i * cell, oy + j * cell
            d.rectangle((x + gap / 2, y + gap / 2, x + cell - gap / 2, y + cell - gap / 2), fill=SHADES[int(ch)] + (255,))
    return im.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    for n in (16, 32, 48, 96, 128):
        icon(n).save(f"icons/icon-{n}.png")
        print(f"icons/icon-{n}.png")
