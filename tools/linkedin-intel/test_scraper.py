#!/usr/bin/env python3
"""Tests for linkedin-intel scraper utilities."""

import pytest
from linkedin_common import parse_slug, parse_activity_id


class TestParseSlug:
    def test_standard_url(self):
        assert parse_slug("https://www.linkedin.com/in/john-doe/") == "john-doe"

    def test_url_without_trailing_slash(self):
        assert parse_slug("https://www.linkedin.com/in/john-doe") == "john-doe"

    def test_url_with_query_params(self):
        assert parse_slug("https://www.linkedin.com/in/john-doe?utm_source=test") == "john-doe"

    def test_url_with_extra_path(self):
        assert parse_slug("https://www.linkedin.com/in/john-doe/recent-activity/") == "john-doe"

    def test_slug_with_numeric_suffix(self):
        assert parse_slug("https://www.linkedin.com/in/john-doe-a534215a/") == "john-doe-a534215a"

    def test_invalid_url_raises(self):
        with pytest.raises(ValueError, match="Cannot extract LinkedIn slug"):
            parse_slug("https://www.linkedin.com/company/some-company/")


class TestParseActivityId:
    def test_urn_format(self):
        url = "https://www.linkedin.com/feed/update/urn:li:activity:7654321098765432100/"
        assert parse_activity_id(url) == "7654321098765432100"

    def test_posts_format(self):
        url = "https://www.linkedin.com/posts/some-slug_topic-activity-7654321098765432100-xxxx"
        assert parse_activity_id(url) == "7654321098765432100"

    def test_urn_without_trailing_slash(self):
        url = "https://www.linkedin.com/feed/update/urn:li:activity:7654321098765432100"
        assert parse_activity_id(url) == "7654321098765432100"

    def test_invalid_url_raises(self):
        with pytest.raises(ValueError, match="Cannot extract activity ID"):
            parse_activity_id("https://www.linkedin.com/feed/")

    def test_20_digit_id(self):
        url = "https://www.linkedin.com/feed/update/urn:li:activity:76543210987654321001/"
        assert parse_activity_id(url) == "76543210987654321001"
