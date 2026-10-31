from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .currencies import CURRENCY_DIGITS

PositiveId = Annotated[int, Field(gt=0)]
Amount = Annotated[Decimal, Field(ge=0, le=Decimal("1000000000000"), allow_inf_nan=False)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Priced(Input):
    currency: str = "USD"

    @field_validator("currency")
    @classmethod
    def supported_currency(cls, value):
        value = value.upper()
        if value not in CURRENCY_DIGITS:
            raise ValueError("unsupported_currency")
        return value

    @model_validator(mode="after")
    def valid_precision(self):
        quantum = Decimal(1).scaleb(-CURRENCY_DIGITS[self.currency])
        if any(
            isinstance(value, Decimal) and value != value.quantize(quantum)
            for value in self.__dict__.values()
        ):
            raise ValueError("invalid_currency_precision")
        return self


class Variant(Input):
    name: str = Field(min_length=1, max_length=160)
    brand: str = Field(default="", max_length=160)
    sku: str = Field(default="", max_length=80)
    price_adjustment: Decimal = Field(
        default=Decimal(0),
        ge=Decimal("-1000000000000"),
        le=Decimal("1000000000000"),
        allow_inf_nan=False,
    )
    active: bool = True


class Product(Priced):
    name: str = Field(min_length=1, max_length=160)
    type: Literal["software", "add_on", "service"] = "software"
    sku: str = Field(default="", max_length=80)
    sales_price: Amount
    cost_price: Amount = Decimal(0)
    notes: str = Field(default="", max_length=2000)
    variants: list[Variant] = Field(default_factory=list, max_length=100)
    active: bool = True

    @model_validator(mode="after")
    def valid_adjustments(self):
        if any(self.sales_price + variant.price_adjustment < 0 for variant in self.variants):
            raise ValueError("variant_price_negative")
        quantum = Decimal(1).scaleb(-CURRENCY_DIGITS[self.currency])
        if any(
            variant.price_adjustment != variant.price_adjustment.quantize(quantum)
            for variant in self.variants
        ):
            raise ValueError("invalid_currency_precision")
        return self


class Plan(Priced):
    name: str = Field(min_length=1, max_length=160)
    price: Amount
    billing_interval: Literal["daily", "weekly", "monthly", "yearly"]
    minimum_quantity: int = Field(default=1, gt=0)
    available_from: date | None = None
    available_until: date | None = None
    allow_pause: bool = False
    allow_early_close: bool = False
    allow_renewal: bool = False
    auto_close: bool = False
    active: bool = True

    @model_validator(mode="after")
    def valid_dates(self):
        if (
            self.available_from
            and self.available_until
            and self.available_from > self.available_until
        ):
            raise ValueError("invalid_availability_dates")
        return self


class Tax(Input):
    name: str = Field(min_length=1, max_length=160)
    rate_percent: Decimal = Field(gt=0, le=100, allow_inf_nan=False)
    country: str = Field(default="", max_length=2)
    region: str = Field(default="", max_length=80)
    effective_from: date
    effective_until: date | None = None
    active: bool = True

    @model_validator(mode="after")
    def valid_dates(self):
        self.country = self.country.upper()
        if self.effective_until and self.effective_from > self.effective_until:
            raise ValueError("invalid_tax_dates")
        return self


class Discount(Input):
    name: str = Field(min_length=1, max_length=160)
    kind: Literal["fixed", "percentage"]
    value: Decimal = Field(gt=0, le=Decimal("1000000000000"), allow_inf_nan=False)
    currency: str = "USD"
    scope: Literal["subscription", "products"] = "subscription"
    minimum_purchase: Amount = Decimal(0)
    minimum_quantity: int = Field(default=1, ge=1)
    starts_on: date
    ends_on: date | None = None
    usage_limit: int | None = Field(default=None, gt=0)
    product_ids: list[PositiveId] = Field(default_factory=list)
    active: bool = True

    @model_validator(mode="after")
    def valid_rule(self):
        self.currency = self.currency.upper()
        if self.currency not in CURRENCY_DIGITS:
            raise ValueError("unsupported_currency")
        if self.kind == "percentage" and self.value > 100:
            raise ValueError("percentage_exceeds_100")
        if self.ends_on and self.starts_on > self.ends_on:
            raise ValueError("invalid_discount_dates")
        if self.scope == "products" and not self.product_ids:
            raise ValueError("products_required")
        if self.scope == "subscription" and self.product_ids:
            raise ValueError("unexpected_product_scope")
        return self


class Line(BaseModel):
    model_config = ConfigDict(extra="ignore")
    product_id: PositiveId
    variant_id: int | None = Field(default=None, ge=0)
    quantity: int = Field(gt=0)


class Template(Input):
    name: str = Field(min_length=1, max_length=160)
    plan_id: PositiveId
    validity_days: int = Field(default=30, gt=0, le=365)
    lines: list[Line] = Field(min_length=1, max_length=100)
    active: bool = True


class Subscription(Input):
    customer_id: PositiveId
    plan_id: PositiveId | None = None
    template_id: PositiveId | None = None
    start_date: date
    expiry_date: date
    payment_terms_days: int = Field(default=14, ge=0, le=365)
    billing_country: str = Field(default="", max_length=2)
    billing_region: str = Field(default="", max_length=80)
    billing_timezone: str = "UTC"
    lines: list[Line] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def valid_subscription(self):
        if self.start_date >= self.expiry_date:
            raise ValueError("invalid_subscription_dates")
        if not self.template_id and (not self.plan_id or not self.lines):
            raise ValueError("plan_and_lines_required")
        try:
            ZoneInfo(self.billing_timezone)
        except ZoneInfoNotFoundError:
            raise ValueError("invalid_timezone")
        self.billing_country = self.billing_country.upper()
        return self


class PaymentInput(Priced):
    method: Literal["bank_transfer", "card", "cash", "other"]
    amount: Decimal = Field(gt=0, le=Decimal("1000000000000"), allow_inf_nan=False)
    paid_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    note: str = Field(default="", max_length=1000)

    @field_validator("paid_at")
    @classmethod
    def normalize_time(cls, value):
        if value.tzinfo is None:
            raise ValueError("timezone_required")
        return value.astimezone(timezone.utc)


SCHEMAS = {
    "products": Product,
    "plans": Plan,
    "tax-rules": Tax,
    "discount-rules": Discount,
    "quotation-templates": Template,
    "subscriptions": Subscription,
}


def parse_record(kind, payload):
    return SCHEMAS[kind].model_validate(payload).model_dump(mode="json")


class CustomerChange(Input):
    action: Literal["add_on", "pause", "resume", "renew", "close"]
    product_id: PositiveId | None = None
    variant_id: int | None = Field(default=None, ge=0)
    quantity: int = Field(default=1, gt=0)

    @model_validator(mode="after")
    def add_on_requires_product(self):
        if self.action == "add_on" and not self.product_id:
            raise ValueError("missing_add_on")
        if self.action != "add_on" and (self.product_id is not None or self.variant_id is not None):
            raise ValueError("unexpected_product")
        return self
