from datetime import datetime, timedelta
import zoneinfo


def test_windows_time_zone_fallback_works_without_an_os_database():
    original = zoneinfo.TZPATH
    try:
        zoneinfo.reset_tzpath([])
        zoneinfo.ZoneInfo.clear_cache()
        assert datetime(2026, 10, 31, tzinfo=zoneinfo.ZoneInfo("UTC")).utcoffset() == timedelta(0)
        assert datetime(
            2026, 10, 31, tzinfo=zoneinfo.ZoneInfo("Asia/Kolkata")
        ).utcoffset() == timedelta(hours=5, minutes=30)
    finally:
        zoneinfo.reset_tzpath(original)
        zoneinfo.ZoneInfo.clear_cache()
