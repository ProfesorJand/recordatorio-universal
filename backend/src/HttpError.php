<?php
declare(strict_types=1);

/** Error que se convierte en respuesta HTTP con mensaje para el usuario. */
class HttpError extends Exception
{
    public int $status;

    public function __construct(int $status, string $message)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}
