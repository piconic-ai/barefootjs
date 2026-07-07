<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Controllers\Concerns\BarefootHelper;

abstract class Controller
{
    use BarefootHelper;
}
