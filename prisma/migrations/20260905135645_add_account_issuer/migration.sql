-- AlterTable
ALTER TABLE `accounts` ADD COLUMN `issuer` VARCHAR(190) NOT NULL,
    MODIFY `account_id` VARCHAR(190) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `accounts_issuer_account_id_key` ON `accounts`(`issuer`, `account_id`);

