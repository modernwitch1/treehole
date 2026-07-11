import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd

SCHEDULE_FILE = Path("/Users/hezhong/Desktop/通识选课清单.xlsx")
GUIDE_FILE = Path("/Users/hezhong/Desktop/浙小商选课指南.xlsx.xlsx")
OUTPUT_FILE = Path("/Users/hezhong/Documents/Codex/浙工商树洞/apps/web/src/data/compass.ts")

COLORS = ["#4299E1", "#9F7AEA", "#ED8936", "#48BB78", "#E53E3E", "#0EA5E9", "#10B981"]


def clean(value):
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() == "nan":
        return ""
    return re.sub(r"\s+", " ", text)


def make_id(name, teacher, course_code=""):
    raw = f"{clean(course_code)}::{clean(name)}::{clean(teacher)}"
    return "course-" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]


def review_id(course_id, content):
    return "review-" + hashlib.sha1(f"{course_id}::{content}".encode("utf-8")).hexdigest()[:12]


def course_key(name, teacher, course_code=""):
    return f"{clean(course_code)}::{clean(name)}::{clean(teacher)}"


def add_tag(tags, tag):
    tag = clean(tag)
    if tag and tag not in tags:
        tags.append(tag)


def tags_from_text(mark, module, content):
    tags = []
    add_tag(tags, mark)
    add_tag(tags, module)
    for word, tag in [
        ("给分高", "给分高"),
        ("高分", "给分高"),
        ("90+", "给分高"),
        ("不点名", "不点名"),
        ("点名", "点名"),
        ("签到", "签到"),
        ("论文", "论文"),
        ("考试", "考试"),
        ("作业", "作业"),
        ("小组", "小组展示"),
        ("PPT", "小组展示"),
        ("网课", "网课"),
        ("水", "轻松"),
        ("求评价", "待补充"),
        ("求推荐", "待补充"),
    ]:
        if word in content:
            add_tag(tags, tag)
    return tags[:5]


courses = {}
reviews = defaultdict(list)


def ensure_course(name, teacher, course_type, course_code="", credits="", module=""):
    name = clean(name)
    teacher = clean(teacher) or "待补充"
    course_code = clean(course_code)
    key = course_key(name, teacher, course_code)
    if key not in courses:
        courses[key] = {
            "id": make_id(name, teacher, course_code),
            "courseCode": course_code or None,
            "name": name,
            "teacher": teacher,
            "credits": clean(credits) or None,
            "department": clean(module) or clean(course_type) or "选课指南",
            "category": clean(course_type) or "其他",
            "courseModule": clean(module) or None,
            "reviewCount": 0,
            "topTags": [],
        }
    else:
        course = courses[key]
        if clean(credits) and not course.get("credits"):
            course["credits"] = clean(credits)
        if clean(module) and not course.get("courseModule"):
            course["courseModule"] = clean(module)
            course["department"] = clean(module)
    return key, courses[key]["id"]


def add_review(course_id, mark, module, content, index):
    content = clean(content)
    if not content:
        return
    tags = tags_from_text(mark, module, content)
    reviews[course_id].append(
        {
            "id": review_id(course_id, content),
            "courseId": course_id,
            "tags": tags,
            "content": content,
            "semester": "历史评价",
            "author": {
                "type": "anonymous",
                "pseudonym": {
                    "displayName": "匿名 · 历史选课经验",
                    "color": COLORS[index % len(COLORS)],
                    "isOp": False,
                },
            },
            "helpful": 0,
            "createdAt": "2026-05-26T00:00:00.000+08:00",
        }
    )


schedule = pd.read_excel(SCHEDULE_FILE, sheet_name="Sheet1", dtype=str).fillna("")
seen_schedule = set()
for _, row in schedule.iterrows():
    course_code = clean(row.get("课程号"))
    name = clean(row.get("课程名称"))
    teacher = clean(row.get("姓名"))
    credits = clean(row.get("学分"))
    if not name:
        continue
    sig = course_key(name, teacher, course_code)
    if sig in seen_schedule:
        continue
    seen_schedule.add(sig)
    ensure_course(name, teacher, "通识课", course_code=course_code, credits=credits)


def guide_rows(sheet_name):
    raw = pd.read_excel(GUIDE_FILE, sheet_name=sheet_name, dtype=str, header=None).fillna("")
    for idx, row in raw.iterrows():
        cells = [clean(row.get(i)) for i in range(len(row))]
        if not any(cells):
            continue
        if idx == 0 and any(cell in {"课程名", "老师", "雷/好", "具体情况"} for cell in cells[:4]):
            continue
        yield idx, cells


review_index = 0
for sheet_name in pd.ExcelFile(GUIDE_FILE).sheet_names:
    for _, cells in guide_rows(sheet_name):
        if sheet_name == "通识课":
            name, teacher, mark, module = cells[:4]
            details = "；".join(cell for cell in cells[4:] if cell)
            course_type = "通识课"
        elif sheet_name == "体育课":
            name, teacher, mark = cells[:3]
            module = ""
            details = "；".join(cell for cell in cells[3:] if cell)
            course_type = "体育课"
        elif sheet_name == "专业课":
            name, teacher, mark = cells[:3]
            module = ""
            details = "；".join(cell for cell in cells[3:] if cell)
            course_type = "专业课"
        elif sheet_name == "形策":
            name = cells[0] or "形势与政策"
            teacher = cells[1]
            mark = cells[2]
            module = ""
            details = "；".join(cell for cell in cells[3:] if cell)
            course_type = "形策"
        elif sheet_name == "大英":
            name, teacher, mark = cells[:3]
            module = ""
            details = "；".join(cell for cell in cells[3:] if cell)
            course_type = "大英"
        else:
            name, teacher, mark = cells[:3]
            module = ""
            details = "；".join(cell for cell in cells[3:] if cell)
            course_type = "思政课"

        name = clean(name) or sheet_name
        if not name:
            continue
        _, course_id = ensure_course(name, teacher, course_type, module=module)
        review_index += 1
        parts = []
        if clean(mark):
            parts.append(f"原表标记：{clean(mark)}")
        if clean(details):
            parts.append(clean(details))
        add_review(course_id, mark, module, "；".join(parts), review_index)


for course in courses.values():
    course_reviews = reviews.get(course["id"], [])
    course["reviewCount"] = len(course_reviews)
    tag_counts = {}
    for review in course_reviews:
        for tag in review["tags"]:
            tag_counts[tag] = tag_counts.get(tag, 0) + 1
    course["topTags"] = [tag for tag, _ in sorted(tag_counts.items(), key=lambda item: -item[1])[:5]]

course_list = sorted(courses.values(), key=lambda c: (c["category"], c["name"], c["teacher"]))
review_map = {course["id"]: reviews[course["id"]] for course in course_list if reviews.get(course["id"])}


def dump_ts(value):
    return json.dumps(value, ensure_ascii=False, indent=2)


content = f"""// Generated from desktop course guide spreadsheets.
// 通识选课清单仅导入课程号、课程名称、姓名、学分；未导入教师联系电话、场地、排课时间、容量或剩余名额。

import type {{ Course, CourseReview }} from '@/types/api';

export const COURSE_GUIDE_COURSES: Course[] = {dump_ts(course_list)};

export const COURSE_GUIDE_REVIEWS: Record<string, CourseReview[]> = {dump_ts(review_map)};
"""

OUTPUT_FILE.write_text(content, encoding="utf-8")
print(f"wrote {OUTPUT_FILE}")
print(f"courses={len(course_list)} reviews={sum(len(items) for items in review_map.values())}")
