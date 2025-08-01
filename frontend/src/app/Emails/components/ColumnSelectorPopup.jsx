// Dependencies
import { Popup } from 'reactjs-popup';

// Styles
import styles from '../styles/Emails.module.css';

// Icon Imports
import { ARROW_DOWN_ICON } from '../../../assets/icons';

// Main Component
export default function ColumnSelectorPopup({
	isDropdownOpen,
	setIsDropdownOpen,
	selectedColumnIndex,
	headers,
	handleDropdownColumnSelect,
}) {
	return (
		<Popup
			position="bottom right"
			arrow={false}
			on={["click"]}
			closeOnDocumentClick
			open={isDropdownOpen}
			onOpen={() => setIsDropdownOpen(true)}
			onClose={() => setIsDropdownOpen(false)}
			trigger={
				<button className={styles.columnDropdownTrigger}>
					{selectedColumnIndex !== null 
						? (headers[selectedColumnIndex] || `Column ${selectedColumnIndex + 1}`)
						: 'Select column'}
					<span className={styles.dropdownArrow}>
						{ARROW_DOWN_ICON}
					</span>
				</button>
			}
		>
			<div className={styles.columnDropdownContent}>
				{headers.map((header, index) => (
					<button
						key={index}
						className={`${styles.columnDropdownItem} ${(selectedColumnIndex === index) ? styles.active : ''}`}
						onClick={() => handleDropdownColumnSelect(index)}
					>
						{header || `Column ${index + 1}`}
					</button>
				))}
			</div>
		</Popup>
	)
}