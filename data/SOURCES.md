# CanteenFlow data sources

Research done on 26 November 2026 for the Sprint 1 demo. Everything in the app's seed
data (`src/seed.js`) is tagged with one of three labels:

| Label | Meaning |
|---|---|
| **verified** | Stated on an official Siam University page. |
| **unverified** | Found on a public third-party page (Wongnai, Facebook, Tripadvisor) or an old document. It may be out of date and has not been confirmed with the university or the shop. |
| **demo data** | Invented for the demo because no public source was found. Never presented as fact. |

> CanteenFlow is a student course project (Agile course, team Dagabaaz Re). It is not
> connected to any shop and no real order is sent to anyone.

## Campus

| Fact | Label | Source |
|---|---|---|
| Address: 38 Phetkasem Road, Bang Wa, Phasi Charoen, Bangkok 10160 | verified | https://ico.siam.edu/campus-map, https://inter.siam.edu/sky-lounge-restaurant-at-siam-university/ |
| Building list (1 Administration, 2 Classrooms, 4 Thai Pavilion, 12 Royal Majesty Jubilee, 15 30th Anniversary, 19 Golden Jubilee, 20 Sports Complex, Elephant Gate plaza) | verified | https://inter.siam.edu/?p=882, https://ico.siam.edu/campus-map |
| No positions or distances between buildings | not found | The campus map pages are text lists, so the app shows an **area list**, not a drawn map. |

## Food places found

| Place | Area | What the source says | Label | Source |
|---|---|---|---|---|
| Main Cafeteria | Building 15 (student-support page). The campus map lists it without a number. | "Main Cafeteria: Thai, Japanese; Korean food" | verified (building number from one official page only) | https://inter.siam.edu/international-student-support/, https://ico.siam.edu/campus-map |
| Thai Pavilion cafeteria | Building 4 | "cafeteria; ... 7-Eleven convenience store". A newer page says "cafeteria; KFC; Lawson convenience store". | verified (cafeteria). The convenience store is unverified because the pages disagree. | https://inter.siam.edu/?p=882, https://inter.siam.edu/international-student-support/ |
| Building 12 cafeteria | Royal Majesty Jubilee Building | "central library / 1,500-seat auditorium / cafeteria" on the older map. Not on the newer page. | unverified (may have closed) | https://inter.siam.edu/?p=882 |
| Sky Lounge Restaurant | Building 19, 9th floor | Location stated on an official 2015 news page. A web search summary of the old International College student handbook described it as student-run and open Mon-Fri 11:00-15:00. | location verified. Student-run and hours are **unverified**: the handbook PDF could not be opened (expired certificate). | https://inter.siam.edu/sky-lounge-restaurant-at-siam-university/, http://ibba.siamnet.asia/wp-content/uploads/2021/07/STUDENT-HANDBOOK-V3-FINAL.pdf (not opened) |
| Siam Cafe (สยามคาเฟ่) | "อยู่ในมหาวิทยาลัยสยาม แยกแรกขวามือ ร้านอยู่ทางขวา" (inside the university, first turn right) | อาหารตามสั่ง (made-to-order Thai). Mon-Fri 08:00-16:00, Sat 09:00-16:00. Under ฿100. One review mentions กระเพราหมู. A second listing "ด้านหน้ามหาวิทยาลัย ตรงข้ามตู้กดเงินกรุงไทย" says Mon-Sat 08:00-16:30. A Facebook page puts "Siam Café" at the Sala Thai area serving Thai and Western food. | unverified | https://www.wongnai.com/restaurants/3210809Tn-%E0%B8%AA%E0%B8%A2%E0%B8%B2%E0%B8%A1%E0%B8%84%E0%B8%B2%E0%B9%80%E0%B8%9F%E0%B9%88-%E0%B8%A1%E0%B8%AB%E0%B8%B2%E0%B8%A7%E0%B8%B4%E0%B8%97%E0%B8%A2%E0%B8%B2%E0%B8%A5%E0%B8%B1%E0%B8%A2%E0%B8%AA%E0%B8%A2%E0%B8%B2%E0%B8%A1, https://www.wongnai.com/restaurants/1866632Xr-%E0%B8%AA%E0%B8%A2%E0%B8%B2%E0%B8%A1%E0%B8%84%E0%B8%B2%E0%B9%80%E0%B8%9F%E0%B9%88, https://www.facebook.com/siamcafeuni/ |
| Krua Sai Jai Cafe branch 4 (ครัวใส่ใจคาเฟ่ สาขา 4) | "มหาวิทยาลัยสยาม" (no building given) | อาหารจานเดียว (one-plate meals). ฿฿ (101-250). The photo caption shows หมี่ผัดกระเฉดกุ้ง. Reviews from 2025. No hours listed. | unverified | https://www.wongnai.com/restaurants/3105477wH-%E0%B8%84%E0%B8%A3%E0%B8%B1%E0%B8%A7%E0%B9%83%E0%B8%AA%E0%B9%88%E0%B9%83%E0%B8%88%E0%B8%84%E0%B8%B2%E0%B9%80%E0%B8%9F%E0%B9%88-%E0%B8%AA%E0%B8%B2%E0%B8%82%E0%B8%B2-4-%E0%B8%A1%E0%B8%AB%E0%B8%B2%E0%B8%A7%E0%B8%B4%E0%B8%97%E0%B8%A2%E0%B8%B2%E0%B8%A5%E0%B8%B1%E0%B8%A2%E0%B8%AA%E0%B8%A2%E0%B8%B2%E0%B8%A1 |
| Hello Tea & Coffee | Building 19, 8th floor ("ตึก19ชั้น8") | Facebook page. A 2018 post mentions bubble tea and drinks. | unverified (old source) | https://www.facebook.com/HelloTeaAndCoffee/ |
| Café Amazon SC1853 | "ข้างโรงอาหารในมหาวิทยาลัยสยาม" (next to the canteen) | Coffee and tea, daily 07:00-18:00. Reviews (2017-2018) mention ลาเต้เย็น 60 บาท and ชาเขียวนม 50 บาท. | unverified | https://www.wongnai.com/restaurants/292971id-caf%C3%A9-amazon-sc1853-%E0%B8%A1-%E0%B8%AA%E0%B8%A2%E0%B8%B2%E0%B8%A1 |
| True Coffee Siam University | 235 Phetkasem Rd. (no building given) | Coffee, bakery. Mon-Sat about 07:00-15:00 (listing is inconsistent). Reviews mention "ชาซีลอนพรีเมี่ยมโบราณ แก้วใหญ่ 100 บาท". | unverified | https://www.wongnai.com/restaurants/147388tT-true-coffee-%E0%B8%A1%E0%B8%AB%E0%B8%B2%E0%B8%A7%E0%B8%B4%E0%B8%97%E0%B8%A2%E0%B8%B2%E0%B8%A5%E0%B8%B1%E0%B8%A2%E0%B8%AA%E0%B8%A2%E0%B8%B2%E0%B8%A1, https://www.tripadvisor.com/Restaurant_Review-g293916-d10383761-Reviews-True_Coffee_Siam_University-Bangkok.html |
| KFC Siam University | Building 4 (student-support page) | Fast food, daily 09:30-22:00 (Wongnai). | location verified on one official page. Hours unverified. | https://inter.siam.edu/international-student-support/, https://www.wongnai.com/restaurants/1082837vm-kfc-%E0%B8%A1%E0%B8%AB%E0%B8%B2%E0%B8%A7%E0%B8%B4%E0%B8%97%E0%B8%A2%E0%B8%B2%E0%B8%A5%E0%B8%B1%E0%B8%A2%E0%B8%AA%E0%B8%A2%E0%B8%B2%E0%B8%A1 |

## How the research became seed data

- **Orderable stalls (7):** Siam Cafe, Krua Sai Jai Cafe, Main Cafeteria Japanese counter,
  Main Cafeteria Korean counter, Thai Pavilion noodle counter, Sky Lounge Restaurant, and Hello Tea & Coffee.
- **Area list only (not orderable):** KFC, Café Amazon, True Coffee, the convenience store, and the Building 12 cafeteria.
  Chain brands are kept out of ordering so the demo never shows invented brand menus or prices.
- **The cafeteria counters** (Japanese, Korean, noodle) are **demo data**. The official map says the Main
  Cafeteria serves Thai, Japanese and Korean food, but no source names its stalls.
- **All menu prices, prep times, pickup slots and sold-out states are demo data.** Prices sit in the bands
  the listings give (under ฿100 for Siam Cafe, ฿101-250 for Krua Sai Jai). Dish names come from the listing
  where one was found (กระเพราหมู, หมี่ผัดกระเฉดกุ้ง).
- **Open/closed today is demo data.** Sky Lounge is seeded as closed so the "closed stall" rule can be shown.
  Nobody checked whether it is really open.
- **Opening hours** shown in the app come from the listings above where they exist (unverified). Where none
  exist they are demo data and marked as such in the app.
- **Food images** are simple drawn illustrations made for this project, not photos of the real dishes.

## To verify before any real use

1. Walk the campus. Confirm each stall's name, building and hours, and collect real menus and prices.
2. Check whether the Building 12 cafeteria and the Sky Lounge still operate.
3. Ask each vendor for permission before listing them.
